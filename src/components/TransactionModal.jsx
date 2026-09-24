import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Paperclip, MapPin, X, FileText, Tag as TagIcon } from 'lucide-react'
import Modal from './Modal'
import MoneyInput from './MoneyInput'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayLocal } from '../lib/dates'
import { quickParse } from '../lib/quickparse'
import { compressImage, dataUrlToBlob } from '../lib/image'
import { notifyChange } from '../lib/events'

const DRAFT_KEY = 'mb-tx-draft'
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } }
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ } }

// edit: movimiento a editar · prefill: valores iniciales (carga rápida, atajos, duplicar, calendario)
export default function TransactionModal({ onClose, onSaved, edit, prefill, defaultAccount, actions }) {
  const { household, user } = useAuth()
  const draft = edit || prefill ? null : readDraft()
  const init = edit ? {
    type: edit.type, amount: Number(edit.amount), accountId: edit.account_id, toAccount: edit.transfer_account_id || '',
    categoryId: edit.category_id || '', date: edit.occurred_on, payee: edit.payee || '', note: edit.note || '',
    tags: edit.tags || [], location: edit.location || '', attachment: edit.attachment_path || '',
  } : { type: 'expense', amount: 0, accountId: defaultAccount || '', toAccount: '', categoryId: '', date: todayLocal(), payee: '', note: '', tags: [], location: '', attachment: '', ...(draft || {}), ...(prefill || {}) }

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [allTags, setAllTags] = useState([])
  const [type, setType] = useState(init.type)
  const [amount, setAmount] = useState(init.amount || 0)
  const [accountId, setAccountId] = useState(init.accountId || '')
  const [toAccount, setToAccount] = useState(init.toAccount || '')
  const [categoryId, setCategoryId] = useState(init.categoryId || '')
  const [date, setDate] = useState(init.date || todayLocal())
  const [payee, setPayee] = useState(init.payee || '')
  const [note, setNote] = useState(init.note || '')
  const [tags, setTags] = useState(init.tags || [])
  const [tagText, setTagText] = useState('')
  const [location, setLocation] = useState(init.location || '')
  const [attachment, setAttachment] = useState(init.attachment || '') // ruta en storage
  const [newFile, setNewFile] = useState(null) // { blob, ext, preview }
  const [quick, setQuick] = useState('')
  const [showMore, setShowMore] = useState(!!(init.tags?.length || init.location || init.attachment || init.note))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    if (!household) return
    supabase.from('accounts').select('*').eq('archived', false).order('sort').order('name')
      .then(({ data }) => {
        setAccounts(data || [])
        const byName = prefill?.accountName && (data || []).find((a) => [a.name, a.bank, a.bank_alias].filter(Boolean).some((n) => n.toLowerCase().includes(prefill.accountName.toLowerCase())))
        if (byName) setAccountId(byName.id)
        else if (!accountId && data?.length) setAccountId(household.default_account_id && data.some((a) => a.id === household.default_account_id) ? household.default_account_id : data[0].id)
      })
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategories(data || []))
    supabase.from('transactions').select('tags').neq('tags', '{}').limit(400)
      .then(({ data }) => setAllTags([...new Set((data || []).flatMap((t) => t.tags || []))].sort()))
  }, [household]) // eslint-disable-line react-hooks/exhaustive-deps

  // borrador automático (solo al crear desde cero)
  useEffect(() => {
    if (edit || prefill) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ type, amount, accountId, toAccount, categoryId, date, payee, note })) } catch { /* noop */ }
  }, [edit, prefill, type, amount, accountId, toAccount, categoryId, date, payee, note])

  const cats = useMemo(() => {
    const list = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
    const parents = list.filter((c) => !c.parent_id)
    const out = []
    parents.forEach((p) => { out.push(p); list.filter((c) => c.parent_id === p.id).forEach((ch) => out.push({ ...ch, sub: true })) })
    list.filter((c) => c.parent_id && !parents.some((p) => p.id === c.parent_id)).forEach((c) => out.push(c))
    return out
  }, [categories, type])

  const applyQuick = () => {
    const r = quickParse(quick, { accounts, categories })
    if (r.type) setType(r.type)
    if (r.amount) setAmount(r.amount)
    if (r.accountId) setAccountId(r.accountId)
    if (r.toAccountId) setToAccount(r.toAccountId)
    if (r.categoryId) setCategoryId(r.categoryId)
    if (r.payee) setPayee(r.payee)
    if (r.date) setDate(r.date)
    setQuick('')
  }

  const addTag = (t) => {
    const v = String(t || tagText).trim().replace(/^#/, '')
    if (v && !tags.includes(v)) setTags([...tags, v])
    setTagText('')
  }

  const pickFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try {
      if (f.type === 'application/pdf') setNewFile({ blob: f, ext: 'pdf', preview: null, name: f.name })
      else { const url = await compressImage(f, 1400, 0.75); setNewFile({ blob: dataUrlToBlob(url), ext: 'jpg', preview: url }) }
    } catch { setErr('No pude leer el archivo') }
    e.target.value = ''
  }

  const openAttachment = async () => {
    const { data } = await supabase.storage.from('adjuntos').createSignedUrl(attachment, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const amt = Math.round(Number(amount) || 0)
    if (!amt || amt <= 0) return setErr('Ingresá un monto válido')
    if (!accountId) return setErr('Elegí una cuenta')
    if (type === 'transfer' && (!toAccount || toAccount === accountId)) return setErr('Elegí una cuenta destino distinta')
    setBusy(true)
    let path = attachment || null
    if (newFile) {
      const key = `${household.id}/${crypto.randomUUID()}.${newFile.ext}`
      const { error: upErr } = await supabase.storage.from('adjuntos').upload(key, newFile.blob, { contentType: newFile.ext === 'pdf' ? 'application/pdf' : 'image/jpeg' })
      if (upErr) { setBusy(false); return setErr('No se pudo subir el adjunto: ' + upErr.message) }
      path = key
    }
    const payload = {
      household_id: household.id,
      account_id: accountId,
      transfer_account_id: type === 'transfer' ? toAccount : null,
      type, amount: amt, currency: 'PYG',
      category_id: type === 'transfer' ? null : (categoryId || null),
      occurred_on: date, payee: payee || null, note: note || null,
      tags, location: location || null, attachment_path: path,
    }
    let error
    if (edit) ({ error } = await supabase.from('transactions').update(payload).eq('id', edit.id))
    else ({ error } = await supabase.from('transactions').insert({ ...payload, created_by: user.id }))
    setBusy(false)
    if (error) return setErr(error.message)
    if (!edit && !prefill) clearDraft()
    notifyChange()
    onSaved?.()
    onClose()
  }

  const suggestions = allTags.filter((t) => !tags.includes(t) && (!tagText || t.toLowerCase().includes(tagText.toLowerCase()))).slice(0, 8)

  return (
    <Modal title={edit ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form onSubmit={save}>
        {!edit && (
          <div className="field">
            <div style={{ position: 'relative' }}>
              <Sparkles size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--accent)' }} />
              <input className="form-input" style={{ paddingLeft: 36, paddingRight: 70 }} value={quick} onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyQuick() } }}
                placeholder='Escribí: "café 15 mil ueno"' />
              {quick && <button type="button" className="btn btn-soft btn-sm" style={{ position: 'absolute', right: 6, top: 6 }} onClick={applyQuick}>Listo</button>}
            </div>
          </div>
        )}

        <div className="segmented" style={{ marginBottom: 16 }}>
          <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => setType('expense')}>Gasto</button>
          <button type="button" className={type === 'income' ? 'active-blue' : ''} onClick={() => setType('income')}>Ingreso</button>
          <button type="button" className={type === 'transfer' ? 'active-gray' : ''} onClick={() => setType('transfer')}>Transferencia</button>
        </div>

        <div className="field">
          <label>Monto (podés hacer cuentas: 50000+35000)</label>
          <MoneyInput value={amount} onChange={setAmount} autoFocus={!prefill?.amount} big placeholder="150.000" />
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>{type === 'transfer' ? 'Desde' : 'Cuenta'}</label>
            <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {type === 'transfer' ? (
            <div className="field">
              <label>Hacia</label>
              <select className="form-select" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                <option value="">Elegir…</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Categoría</label>
              <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sin categoría</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.sub ? '   ↳ ' : ''}{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Fecha</label>
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{type === 'income' ? 'De quién' : type === 'transfer' ? 'Detalle' : 'Comercio / persona'}</label>
            <input className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        {!showMore ? (
          <button type="button" className="link" style={{ marginBottom: 14 }} onClick={() => setShowMore(true)}>+ Nota, etiquetas, foto del ticket, ubicación</button>
        ) : (
          <>
            <div className="field">
              <label>Nota</label>
              <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="field">
              <label><TagIcon size={12} style={{ verticalAlign: -1 }} /> Etiquetas</label>
              <div className="row wrap" style={{ gap: 6, marginBottom: tags.length ? 8 : 0 }}>
                {tags.map((t) => (
                  <span key={t} className="badge badge-green">#{t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: 'none', border: 'none', color: 'inherit', display: 'grid' }}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <input className="form-input" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Ej: viaje, trabajo, regalo (Enter para agregar)"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} onBlur={() => tagText && addTag()} />
              {suggestions.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {suggestions.map((t) => <button type="button" key={t} className="badge chip-btn" onClick={() => addTag(t)}>#{t}</button>)}
                </div>
              )}
            </div>

            <div className="field">
              <label><MapPin size={12} style={{ verticalAlign: -1 }} /> Ubicación</label>
              <input className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Shopping del Sol" />
            </div>

            <div className="field">
              <label><Paperclip size={12} style={{ verticalAlign: -1 }} /> Ticket o factura</label>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={pickFile} style={{ display: 'none' }} />
              {newFile ? (
                <div className="row" style={{ gap: 10 }}>
                  {newFile.preview ? <img src={newFile.preview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} /> : <span className="tile"><FileText size={18} /></span>}
                  <span className="text-2" style={{ fontSize: 13, flex: 1 }}>{newFile.name || 'Foto lista para guardar'}</span>
                  <button type="button" className="icon-btn" onClick={() => setNewFile(null)}><X size={15} /></button>
                </div>
              ) : attachment ? (
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={openAttachment}><FileText size={15} /> Ver adjunto</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Cambiar</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttachment('')}>Quitar</button>
                </div>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Paperclip size={15} /> Sacar foto o subir archivo</button>
              )}
            </div>
          </>
        )}

        {err && <div className="text-red" style={{ fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {actions && <div className="row" style={{ gap: 8, marginTop: 10 }}>{actions}</div>}
      </form>
    </Modal>
  )
}
