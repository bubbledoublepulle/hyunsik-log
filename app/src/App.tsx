import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import AuthModal from "@/components/AuthModal";
import Navbar from "@/components/Navbar";
import LoadingPage from "@/pages/LoadingPage";
import HomePage from "@/pages/HomePage";
import MusicPage from "@/pages/MusicPage";
import ShowsPage from "@/pages/ShowsPage";
import SocialPage from "@/pages/SocialPage";

function HomeRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const loaded = sessionStorage.getItem("hsik_loaded");
    if (!loaded) {
      sessionStorage.setItem("hsik_loaded", "true");
      navigate("/loading", { replace: true });
    }
  }, [navigate]);
  return (
    <div className="min-h-screen bg-[#F8F9FA] pt-16">
      <Navbar />
      <HomePage />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/loading" element={<LoadingPage />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/music"
            element={
              <div className="min-h-screen bg-[#F8F9FA] pt-16">
                <Navbar />
                <MusicPage />
              </div>
            }
          />
          <Route
            path="/shows"
            element={
              <div className="min-h-screen bg-[#F8F9FA] pt-16">
                <Navbar />
                <ShowsPage />
              </div>
            }
          />
          <Route
            path="/social"
            element={
              <div className="min-h-screen bg-[#F8F9FA] pt-16">
                <Navbar />
                <SocialPage />
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <AuthModal />
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: "12px",
          },
        }}
      />
    </AuthProvider>
  );
}

export default App;
