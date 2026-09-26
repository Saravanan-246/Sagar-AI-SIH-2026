import { Navigate, Route, Routes } from "react-router-dom";

import Home from "../pages/Home";
import Map from "../pages/Map";
import Chat from "../pages/Chat";
import RoutePage from "../pages/Route";
import Scenario from "../pages/Scenario";
import Alerts from "../pages/Alerts";
import Decisions from "../pages/Decisions";
import Activity from "../pages/Activity";
import Area from "../pages/Area";
import Sources from "../pages/Sources";
import Profile from "../pages/Profile";
import SstResearchLab from "../pages/SstResearchLab";
import MarineIntelligenceLab from "../pages/MarineIntelligenceLab";
import InvestigateWithSagar from "../pages/InvestigateWithSagar";

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/map" element={<Map />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/route" element={<RoutePage />} />
      <Route path="/scenario" element={<Scenario />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/decisions" element={<Decisions />} />
      <Route path="/activity" element={<Activity />} />
      <Route path="/area/:id" element={<Area />} />
      <Route path="/sources" element={<Sources />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/research/sst" element={<SstResearchLab />} />
      <Route path="/research/marine-lab" element={<MarineIntelligenceLab />} />
      <Route path="/research/investigate" element={<InvestigateWithSagar />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}