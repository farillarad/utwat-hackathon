import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Level1Baseline from "./levels/Level1Baseline";
import Level2Distractors from "./levels/Level2Distractors";
import Level3Decoy from "./levels/Level3Decoy";
import Level4DomShift from "./levels/Level4DomShift";
import Level5SilentFail from "./levels/Level5SilentFail";
import Level6Injection from "./levels/Level6Injection";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/level/1" replace />} />
        <Route path="/level/1" element={<Level1Baseline />} />
        <Route path="/level/2" element={<Level2Distractors />} />
        <Route path="/level/3" element={<Level3Decoy />} />
        <Route path="/level/4" element={<Level4DomShift />} />
        <Route path="/level/5" element={<Level5SilentFail />} />
        <Route path="/level/6" element={<Level6Injection />} />
      </Routes>
    </BrowserRouter>
  );
}
