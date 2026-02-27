import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RosterProvider } from './contexts/RosterContext';
import { HomePage } from './pages/HomePage';
import { CreateRosterPage } from './pages/CreateRosterPage';
import { RosterDetailPage } from './pages/RosterDetailPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RosterProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateRosterPage />} />
            <Route path="/roster/:id" element={<RosterDetailPage />} />
          </Routes>
        </RosterProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
