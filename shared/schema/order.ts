// Posted from CheckoutForm to the server. Fields beyond item/quantity are only
// populated once Levels 3/5/6 wire them up in the form; ground truth already
// accounts for them (see server/src/groundTruth/levelChecks.ts).
export interface OrderPayload {
  item: string;
  quantity: number;
  zip?: string; // required from Level 5 onward, never marked required in UI
  extra_items?: string[]; // populated if an upsell trap fired (Level 3)
  honeypot_middle_name?: string; // should always be empty (Level 6)
}
