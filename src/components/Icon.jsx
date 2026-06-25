import {
  Wallet, Banknote, Landmark, PiggyBank, CreditCard, TrendingUp, HandCoins,
  Briefcase, LineChart, Gift, PlusCircle, Utensils, ShoppingCart, Car, Fuel,
  Home, Plug, HeartPulse, GraduationCap, Clapperboard, Shirt, Coffee, Repeat,
  PawPrint, Plane, MoreHorizontal, Tag, Target, Receipt,
} from 'lucide-react'

const MAP = {
  wallet: Wallet, banknote: Banknote, landmark: Landmark, 'piggy-bank': PiggyBank,
  'credit-card': CreditCard, 'trending-up': TrendingUp, 'hand-coins': HandCoins,
  briefcase: Briefcase, 'line-chart': LineChart, gift: Gift, 'plus-circle': PlusCircle,
  utensils: Utensils, 'shopping-cart': ShoppingCart, car: Car, fuel: Fuel, home: Home,
  plug: Plug, 'heart-pulse': HeartPulse, 'graduation-cap': GraduationCap,
  clapperboard: Clapperboard, shirt: Shirt, coffee: Coffee, repeat: Repeat,
  'paw-print': PawPrint, plane: Plane, 'more-horizontal': MoreHorizontal,
  tag: Tag, target: Target, receipt: Receipt,
}

export default function Icon({ name, size = 18, ...rest }) {
  const Cmp = MAP[name] || Tag
  return <Cmp size={size} {...rest} />
}
