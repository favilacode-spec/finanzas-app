// Achica una foto en el celular antes de guardarla (JPEG, lado máximo en px)
export function compressImage(file, max = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('sin archivo'))
    const reader = new FileReader()
    const img = new Image()
    reader.onload = () => { img.src = reader.result }
    reader.onerror = reject
    img.onerror = reject
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(b64); const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
