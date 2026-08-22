export type UserRole = 'customer' | 'admin' | 'super_admin' | 'operator' | 'finance';
export type RaffleStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'sales_closed' | 'waiting_result' | 'completed' | 'cancelled';
export type NumberStatus = 'available' | 'reserved' | 'sold' | 'blocked';
export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'refunded';
export type PrizeType = 'main' | 'secondary';
export type PrizeRuleType = 'exact_match' | 'last_digits' | 'first_digits' | 'specific_number';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  created_at: string;
}

export interface RafflePrize {
  id?: number;
  name: string;
  description?: string;
  prize_type: PrizeType;
  prize_value?: number;
  position: number;
  rule_type: PrizeRuleType;
  rule_value?: string;
}

export interface Raffle {
  id: number;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  price_per_number: number;
  total_numbers: number;
  sold_numbers?: number;
  reserved_numbers?: number;
  number_format: string;
  minimum_numbers_per_order?: number;
  maximum_numbers_per_order?: number;
  status: RaffleStatus;
  start_at: string;
  end_at: string;
  prizes?: RafflePrize[];
}

export interface RaffleNumber {
  id: number;
  raffle_id: number;
  number: string;
  status: NumberStatus;
  order_id?: number;
  reserved_until?: string;
}

export interface StatMetric {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  icon: string;
  colorClass?: string;
}

export interface ActivityItem {
  id: string;
  type: 'payment' | 'winner' | 'user';
  title: string;
  time: string;
  description: string;
  badge?: string;
}

export interface CustomerCartItem {
  raffleId: number;
  raffleName: string;
  pricePerTicket: number;
  selectedNumbers: string[];
}

export interface TicketLookupResult {
  orderNumber: string;
  customerName: string;
  raffleName: string;
  drawDate: string;
  lotteryName: string;
  numbers: string[];
  totalPaid: number;
  status: 'confirmed' | 'pending';
}
