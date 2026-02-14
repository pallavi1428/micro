/**
 * File: frontend/src/components/auth/Login.jsx
 * Description: Login page (email/password + Google OAuth)
 * ✅ Uses HTTP-only cookies only
 * ❌ No tokens
 * ❌ No localStorage
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import api, { API } from "@/utils/api";
import { setLoading, setUser } from "@/redux/authSlice";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import GoogleLoginButton from "@/components/GoogleLoginButton";

// ================= LOGIN COMPONENT =================
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { loading, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // ================= EMAIL / PASSWORD LOGIN =================
  const loginHandler = useCallback(async () => {
    if (!email.trim() || !password) {
      return toast.error("Please enter both email and password", {
        duration: 2500,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return toast.error("Please enter a valid email address", {
        duration: 2500,
      });
    }

    try {
      dispatch(setLoading(true));

      const res = await api.post(`${API.USER}/login`, {
        email: email.trim(),
        password,
      });

      if (res.data.success) {
        // ✅ Backend already set HTTP-only cookie
        dispatch(setUser(res.data.data));

        toast.success("Logged in successfully! 🎉", { duration: 1000 });

        setTimeout(() => {
          navigate("/", { replace: true });
        }, 500);
      }
    } catch (error) {
      console.error("❌ Login Error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Invalid email or password. Please try again.",
        { duration: 2500 }
      );
      setPassword("");
    } finally {
      dispatch(setLoading(false));
    }
  }, [email, password, dispatch, navigate]);

  // ================= SESSION CHECK =================
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // ✅ Cookie-based session validation
        const res = await api.get(`${API.USER}/me`);

        if (res.data.success) {
          dispatch(setUser(res.data.user));
          navigate("/", { replace: true });
        }
      } catch (err) {
        // Not authenticated — nothing to do
        console.log("Not authenticated");
      }
    };

    if (!user) {
      checkAuth();
    }
  }, [user, dispatch, navigate]);

  // ================= KEYBOARD HANDLER =================
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && email && password && !loading) {
      loginHandler();
    }
  };

  // ================= UI =================
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-orange-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl border border-gray-200">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-gray-600 mt-2 text-sm">
            Sign in to continue your journey
          </p>
        </div>

        {/* Google OAuth */}
        <div className="mt-6">
          <GoogleLoginButton />
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">
              Or continue with email
            </span>
          </div>
        </div>

        {/* Login Form */}
        <div className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your email"
                disabled={loading}
                className="h-12 pl-10 rounded-lg"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your password"
                disabled={loading}
                className="h-12 pl-10 pr-10 rounded-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button
            className="w-full h-12 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600"
            onClick={loginHandler}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </div>

        {/* Signup */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            className="font-semibold text-purple-600 hover:underline"
          >
            Sign up here
          </Link>
        </div>

        {/* Security */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 text-center">
            🔒 Your data is secure. We use industry-standard encryption.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
