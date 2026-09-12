// Success-looking toast. Used by the optimistic level's "Order placed ✓" and by
// Level 10's "Save for later" — in both cases it is *not* a confirmation.
export default function Toast({ id, message }: { id: string; message: string }) {
  return (
    <div id={id} role="status" className="toast">
      {message}
    </div>
  );
}
