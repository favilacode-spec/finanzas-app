import {
  Wallet, Banknote, Landmark, PiggyBank, CreditCard, TrendingUp, HandCoins,
  Briefcase, LineChart, Gift, PlusCircle, Utensils, ShoppingCart, Car, Fuel,
  Home, Plug, HeartPulse, GraduationCap, Clapperboard, Shirt, Coffee, Repeat,
  PawPrint, Plane, MoreHorizontal, Tag, Target, Receipt, Wifi, Tv, Smartphone,
  Zap, Droplet, Dumbbell, Music, Building2, Baby, Camera, Laptop, Gamepad2,
  Bike, Palmtree, Stethoscope, Pill, ShieldCheck, Sparkles, Bus, Cloud, Film,
  BookOpen, Heart, Wrench, Scissors, Star, Gem, Key,
} from 'lucide-react'

const MAP = {
  wallet: Wallet, banknote: Banknote, landmark: Landmark, 'piggy-bank': PiggyBank,
  'credit-card': CreditCard, 'trending-up': TrendingUp, 'hand-coins': HandCoins,
  briefcase: Briefcase, 'line-chart': LineChart, gift: Gift, 'plus-circle': PlusCircle,
  utensils: Utensils, 'shopping-cart': ShoppingCart, car: Car, fuel: Fuel, home: Home,
  plug: Plug, 'heart-pulse': HeartPulse, 'graduation-cap': GraduationCap,
  clapperboard: Clapperboard, shirt: Shirt, coffee: Coffee, repeat: Repeat,
  'paw-print': PawPrint, plane: Plane, 'more-horizontal': MoreHorizontal,
  tag: Tag, target: Target, receipt: Receipt, wifi: Wifi, tv: Tv, smartphone: Smartphone,
  zap: Zap, droplet: Droplet, dumbbell: Dumbbell, music: Music, building: Building2,
  baby: Baby, camera: Camera, laptop: Laptop, gamepad: Gamepad2, bike: Bike,
  palmtree: Palmtree, stethoscope: Stethoscope, pill: Pill, shield: ShieldCheck,
  sparkles: Sparkles, bus: Bus, cloud: Cloud, film: Film, book: BookOpen, heart: Heart,
  wrench: Wrench, scissors: Scissors, star: Star, gem: Gem, key: Key,
}

// Íconos sugeridos para pagos / suscripciones
export const BILL_ICONS = ['home', 'wifi', 'zap', 'droplet', 'smartphone', 'tv', 'film', 'music', 'cloud', 'dumbbell', 'car', 'credit-card', 'shield', 'stethoscope', 'pill', 'graduation-cap', 'building', 'receipt', 'repeat', 'briefcase']
// Íconos sugeridos para metas
export const GOAL_ICONS = ['target', 'plane', 'palmtree', 'car', 'home', 'camera', 'laptop', 'smartphone', 'gamepad', 'bike', 'gift', 'heart', 'baby', 'graduation-cap', 'shield', 'gem', 'star', 'piggy-bank']
export const COLORS = ['#34d399', '#5eead4', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185', '#f97316', '#fbbf24', '#a3e635', '#94a3b8']

export default function Icon({ name, size = 18, ...rest }) {
  const Cmp = MAP[name] || Tag
  return <Cmp size={size} {...rest} />
}

// Adivina un ícono lindo a partir del nombre del pago
export function guessIcon(text = '') {
  const t = text.toLowerCase()
  const R = [
    [/alquiler|renta|casa|expensa/, 'home'], [/internet|wifi|fibra|tigo|personal|claro|copaco/, 'wifi'],
    [/ande|luz|electric/, 'zap'], [/agua|essap/, 'droplet'], [/celular|telefono|teléfono|plan/, 'smartphone'],
    [/netflix|disney|hbo|max|prime|star\+|youtube/, 'tv'], [/spotify|music|deezer|apple music/, 'music'],
    [/icloud|google one|dropbox|drive/, 'cloud'], [/gym|gimnasio|crossfit/, 'dumbbell'], [/auto|cuota auto|seguro auto|nafta/, 'car'],
    [/tarjeta/, 'credit-card'], [/seguro|prepaga|medic|ebsa|asismed/, 'shield'], [/farmacia|remedio|tirzepatida/, 'pill'],
    [/colegio|universidad|curso|facultad/, 'graduation-cap'], [/salario|sueldo|pago|cliente/, 'briefcase'],
  ]
  return R.find(([re]) => re.test(t))?.[1] || 'receipt'
}
