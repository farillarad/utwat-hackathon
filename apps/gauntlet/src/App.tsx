import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { IS_MOCK_API } from "./api/client";
import LevelPage from "./levels/LevelPage";
import FakeConfirmationPage from "./levels/FakeConfirmationPage";
import LevelIndexPage from "./levels/LevelIndexPage";
import OrdersPage from "./orders/OrdersPage";
import OrderDetailPage from "./orders/OrderDetailPage";

// Every level is one config in shared/levels.ts rendered by LevelPage (PRD-v2 §5).
// The /orders pages are the on-site way to check what the server stored (§4.2).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={IS_MOCK_API ? "/levels" : "/level/1"} replace />} />
        {IS_MOCK_API && <Route path="/levels" element={<LevelIndexPage />} />}
        <Route path="/level/:id" element={<LevelPage />} />
        <Route path="/level/:id/confirmation" element={<FakeConfirmationPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}
