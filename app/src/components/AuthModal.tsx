import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, X, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthModal() {
  const { authModalOpen, setAuthModalOpen, login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);

    const success = await login(password);

    if (success) {
      toast.success("管理员登录成功", {
        description: "您现在可以管理音乐与综艺档案数据",
      });
      setPassword("");
      setError(false);
      setAuthModalOpen(false);
    } else {
      setError(true);
    }
  };

  const handleClose = () => {
    setPassword("");
    setError(false);
    setAuthModalOpen(false);
  };

  return (
    <AnimatePresence>
      {authModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-br from-sky-400 to-sky-600 px-8 py-8">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">管理员验证</h2>
              </div>
              <p className="text-sky-50 text-sm">请输入管理密码以进入管理模式</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  管理密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(false);
                    }}
                    placeholder="请输入密码"
                    autoFocus
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border-2 transition-all outline-none ${
                      error
                        ? "border-red-400 bg-red-50"
                        : "border-gray-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    }`}
                  />
                </div>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-sm text-red-500"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>密码错误，请重新输入</span>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-400 text-white font-medium hover:bg-sky-500 transition-colors shadow-md shadow-sky-200"
                >
                  确认登录
                </button>
              </div>

            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
