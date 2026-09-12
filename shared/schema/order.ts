export interface OrderPayload {
  item: string;
  quantity: number;
  zip?: string;
  extra_items?: string[];
  honeypot_middle_name?: string;
}
