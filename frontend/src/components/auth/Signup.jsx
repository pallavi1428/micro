/**
 * File: frontend/src/components/auth/Signup.jsx
 * Description: Signup page with HTTP-only cookies ONLY
 * ✅ NO localStorage - cookies handle everything
 */

import { useEffect, useState, useCallback } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Link, useNavigate } from "react-router-dom";
import api, { API } from "@/utils/api";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { setLoading, setUser } from "@/redux/authSlice";
import { Loader2, Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import GoogleLoginButton from "@/components/GoogleLoginButton";

const Signup = () => {
  const [input, setInput] = useState({
    email: "",
    fullname: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const { loading, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // ----------------------------
  // Input change handler
  // ----------------------------
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setInput((prev) => ({ ...prev, [name]: value }));
  }, []);

  // ----------------------------
  // Signup handler
  // ----------------------------
  const signupHandler = useCallback(
    async (e) => {
      if (e) e.preventDefault();

      const { email, fullname, password } = input;

      if (!email || !fullname || !password) {
        return toast.error("Please fill all fields", { duration: 3000 });
      }

      if (password.length < 6) {
        return toast.error("Password must be at least 6 characters", {
          duration: 3000,
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return toast.error("Please enter a valid email address", {
          duration: 3000,
        });
      }

      try {
        dispatch(setLoading(true));

        const res = await api.post(`${API.USER}/signup`, {
          email: email.trim(),
          fullname: fullname.trim(),
          password,
        });

        if (res.data?.success) {
          const newUser = res.data.data;

          // ✅ ONLY update Redux - NO localStorage
          dispatch(setUser(newUser));

          toast.success("Account created successfully 🎉", {
            description: "Welcome to Microlancing!",
            duration: 2000,
          });

          setTimeout(() => {
            navigate(`/m/${newUser.userId || newUser._id}`, {
              replace: true,
            });
          }, 1200);
        }
      } catch (err) {
        console.error("Signup Error:", err);
        const message =
          err?.response?.data?.message ||
          err?.response?.data?.errors?.[0]?.error ||
          "Failed to create account. Please try again.";
        toast.error(message, { duration: 4000 });
      } finally {
        dispatch(setLoading(false));
      }
    },
    [input, dispatch, navigate]
  );

  // ----------------------------
  // Check existing session
  // ----------------------------
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get(`${API.USER}/me`);
        
        if (res.data?.success) {
          dispatch(setUser(res.data.user));
          navigate("/", { replace: true });
        }
      } catch {
        // Not authenticated - cookies handle this
        console.log("Not authenticated");
      }
    };

    if (!user) checkAuth();
  }, [user, dispatch, navigate]);

  // ----------------------------
  // Enter key submit
  // ----------------------------
  const handleKeyDown = (e) => {
    if (
      e.key === "Enter" &&
      input.email &&
      input.fullname &&
      input.password
    ) {
      signupHandler(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-orange-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl border border-gray-200">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
            Create Account
          </h2>
          <p className="text-gray-600 mt-2 text-sm">
            Join thousands of freelancers and clients
          </p>
        </div>

        {/* Google Signup */}
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

        {/* Form */}
        <form onSubmit={signupHandler} onKeyDown={handleKeyDown}>
          <div className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  name="fullname"
                  value={input.fullname}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  className="h-12 pl-10"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  type="email"
                  name="email"
                  value={input.email}
                  onChange={handleChange}
                  placeholder="Enter your email"
                  className="h-12 pl-10"
                  disabled={loading}
                  required
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
                  name="password"
                  value={input.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="h-12 pl-10 pr-10"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 text-gray-400"
                  onClick={() => setShowPassword((p) => !p)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Must be at least 6 characters
              </p>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-12 font-semibold bg-gradient-to-r from-purple-600 to-orange-500"
              disabled={
                loading ||
                !input.email ||
                !input.fullname ||
                !input.password
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </div>
        </form>

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-purple-600 hover:underline"
          >
            Sign in here
          </Link>
        </p>

        {/* Security note */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 text-center">
            🔒 Your data is protected with industry-standard security.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;