import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Network from './pages/Network';
import LiveFeed from './pages/LiveFeed';
import { SentimentProvider } from './context/SentimentContext';

// Layout wrapper to conditionally show UI based on route if needed, 
// for now keeping it simple as all pages share the layout
const Layout = ({ children }) => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans selection:bg-primary-500/30 overflow-hidden">
      <Sidebar
        isMobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 lg:ml-64 transition-all duration-300 flex flex-col h-screen relative min-w-0">
        <Topbar onMenuToggle={() => setMobileSidebarOpen((prev) => !prev)} />
        <main className="mt-20 h-[calc(100vh-5rem)] relative z-10 overflow-x-hidden overflow-y-auto">
          {children}
        </main>

        {/* Background Ambient Glows */}
        <div className="fixed top-20 right-0 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[100px] pointer-events-none z-0 mix-blend-screen hidden md:block" />
        <div className="fixed bottom-0 left-64 w-[500px] h-[500px] bg-accent-violet/10 rounded-full blur-[100px] pointer-events-none z-0 mix-blend-screen hidden lg:block" />
      </div>
    </div>
  );
};

function App() {
  return (
    <SentimentProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/network" element={<Network />} />
            <Route path="/live" element={<LiveFeed />} />
            <Route path="*" element={<div className="p-10 text-center text-slate-500">Page not found</div>} />
          </Routes>
        </Layout>
      </Router>
    </SentimentProvider>
  );
}

export default App;
