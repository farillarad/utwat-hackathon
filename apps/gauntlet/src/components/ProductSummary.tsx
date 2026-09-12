import { ITEM_NAME } from "@shared/levels";

// The item being bought, shown above every checkout form.
export default function ProductSummary() {
  return (
    <div className="product-summary">
      <span className="product-thumb" aria-hidden />
      <div className="product-info">
        <span className="product-name">{ITEM_NAME}</span>
        <span className="product-meta">Ships in 2–3 business days</span>
      </div>
      <span className="product-price">$24.00</span>
    </div>
  );
}
