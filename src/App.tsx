/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import EditJourney from './pages/EditJourney';
import Applications from './pages/Applications';
import JobLayout from './layouts/JobLayout';
import Intake from './pages/Intake';
import ParseReview from './pages/ParseReview';
import Keywords from './pages/Keywords';
import PatchReview from './pages/PatchReview';
import FitAnalysisPage from './pages/FitAnalysisPage';
import ResumeStrategy from './pages/ResumeStrategy';
import ExportReady from './pages/Export';
import CareerJourney from './pages/CareerJourney';
import ResumePreview from './pages/ResumePreview';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/edit" element={<EditJourney />} />
            <Route path="/journey" element={<CareerJourney />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/job/:id" element={<JobLayout />}>
              <Route path="intake" element={<Intake />} />
              <Route path="parse" element={<ParseReview />} />
              <Route path="keywords" element={<Keywords />} />
              <Route path="context" element={<Keywords />} />
              <Route path="patch" element={<PatchReview />} />
              <Route path="fit" element={<FitAnalysisPage />} />
              <Route path="strategy" element={<ResumeStrategy />} />
              <Route path="export" element={<ExportReady />} />
              <Route path="preview" element={<ResumePreview />} />
            </Route>
          </Routes>
        </div>
      </div>
    </Router>
  );
}
