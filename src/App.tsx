import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import AuthModal from "@/components/AuthModal";
import Navbar from "@/components/Navbar";
import GridBackground from "@/components/GridBackground";
import LogoDecorations from "@/components/LogoDecorations";
import HomePage from "@/pages/HomePage";
import MusicPage from "@/pages/MusicPage";
import ShowsPage from "@/pages/ShowsPage";
import SocialPage from "@/pages/SocialPage";

function HomeRedirect() {
  return (
    <div className="min-h-0 md:min-h-screen bg-transparent pt-32">
      <GridBackground />
      <LogoDecorations />
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
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/music"
            element={
              <div className="min-h-0 md:min-h-screen bg-transparent pt-32">
                <GridBackground />
                <Navbar />
                <MusicPage />
              </div>
            }
          />
          <Route
            path="/shows"
            element={
              <div className="min-h-0 md:min-h-screen bg-transparent pt-32">
                <GridBackground />
                <Navbar />
                <ShowsPage />
              </div>
            }
          />
          <Route
            path="/social"
            element={
              <div className="min-h-0 md:min-h-screen bg-transparent pt-32">
                <GridBackground />
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
