/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/ui';
import AiActivityIndicator from './components/AiActivityIndicator';
import FeedbackWidget from './components/FeedbackWidget';
import Dashboard from './pages/Dashboard';
import EditJourney from './pages/EditJourney';
import CareerJourneyBuilder from './pages/CareerJourneyBuilder';
import StrengthenJourney from './pages/StrengthenJourney';
import JobTracker from './pages/JobTracker';
import Matches from './pages/Matches';
import Migrate from './pages/Migrate';
import JobLayout from './layouts/JobLayout';
import AdminLayout from './layouts/AdminLayout';
import IntakeStage from './pages/IntakeStage';
import ParsedStage from './pages/ParsedStage';
import RatingStage from './pages/RatingStage';
import TailoredApplicationStage from './pages/TailoredApplicationStage';
import ApplyStage from './pages/ApplyStage';
import InterviewStage from './pages/InterviewStage';
import OfferStage from './pages/OfferStage';
import CompareOffers from './pages/CompareOffers';
import AdminPrompts from './pages/AdminPrompts';
import CareerJourney from './pages/CareerJourney';
import Profile from './pages/Profile';
import Upgrade from './pages/Upgrade';
import Settings from './pages/Settings';
import MyFeedback from './pages/MyFeedback';
import AdminFlags from './pages/AdminFlags';
import AdminModels from './pages/AdminModels';
import AdminUsers from './pages/AdminUsers';
import AdminTickets from './pages/AdminTickets';
import Terms from './pages/legal/Terms';
import Privacy from './pages/legal/Privacy';
import Refunds from './pages/legal/Refunds';
import Footer from './components/Footer';

export default function App() {
  return (
    <ToastProvider>
    <Router>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <AiActivityIndicator />
        <FeedbackWidget />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/edit" element={<EditJourney />} />
            <Route path="/build" element={<CareerJourneyBuilder />} />
            <Route path="/strengthen" element={<StrengthenJourney />} />
            <Route path="/journey" element={<CareerJourney />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/migrate" element={<Migrate />} />
            <Route path="/applications" element={<JobTracker />} />
            <Route path="/compare-offers" element={<CompareOffers />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedback" element={<MyFeedback />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="flags" element={<AdminFlags />} />
              <Route path="models" element={<AdminModels />} />
              <Route path="prompts" element={<AdminPrompts />} />
            </Route>
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/refunds" element={<Refunds />} />
            <Route path="/job/:id" element={<JobLayout />}>
              <Route path="intake" element={<IntakeStage />} />
              <Route path="parsed" element={<ParsedStage />} />
              <Route path="rating" element={<RatingStage />} />
              <Route path="keywords" element={<Navigate to="../rating" replace />} />
              <Route path="context" element={<Navigate to="../rating" replace />} />
              <Route path="patch" element={<Navigate to="../rating" replace />} />
              <Route path="fit" element={<Navigate to="../rating" replace />} />
              <Route path="tailored" element={<TailoredApplicationStage />} />
              <Route path="strategy" element={<Navigate to="../tailored" replace />} />
              <Route path="export" element={<Navigate to="../tailored" replace />} />
              <Route path="preview" element={<Navigate to="../tailored" replace />} />
              <Route path="cover-letter" element={<Navigate to="../tailored" replace />} />
              <Route path="apply" element={<ApplyStage />} />
              <Route path="interview" element={<InterviewStage />} />
              <Route path="offer" element={<OfferStage />} />
            </Route>
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
    </ToastProvider>
  );
}
