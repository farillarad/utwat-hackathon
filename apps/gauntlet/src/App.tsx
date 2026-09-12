import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LevelPage from "./levels/LevelPage";
import FakeConfirmationPage from "./levels/FakeConfirmationPage";

// Every level is one config in shared/levels.ts rendered by LevelPage (PRD-v2 §5).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/level/1" replace />} />
        <Route path="/level/:id" element={<LevelPage />} />
        <Route path="/level/:id/confirmation" element={<FakeConfirmationPage />} />
      </Routes>
    </BrowserRouter>
  );
}
