import { useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, FileText, Bot, BarChart3, Settings, History, MessageSquare, CreditCard, TrendingUp } from "lucide-react";
import recoveriqLogo from "../assets/recoveriq_svg.svg";
import { useAuth } from "../contexts/AuthContext";
import { StatusPulse } from "../components/premium";

interface NavGroup {
  title?: string;
  items: {
    label: string;
    path: string;
    icon: React.ElementType;
    visible?: boolean;
    pulse?: boolean;
  }[];
}

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const isNotViewer = user?.role !== 'viewer';

  const navGroups: NavGroup[] = [
    {
      items: [
        { label: "Home", path: "/", icon: Home, visible: true },
        { label: "Invoices", path: "/invoices", icon: FileText, visible: true },
        { label: "Autopilot", path: "/agent", icon: Bot, visible: true },
      ],
    },
    {
      title: "WORKSPACE",
      items: [
        { label: "Payment Plans", path: "/payment-plans", icon: CreditCard, visible: isAdminOrManager },
        { label: "Inquiries", path: "/disputes", icon: MessageSquare, visible: isAdminOrManager },
      ],
    },
    {
      title: "INSIGHTS",
      items: [
        { label: "Analytics", path: "/analytics", icon: BarChart3, visible: true },
        { label: "Recovery", path: "/recovery", icon: TrendingUp, visible: true, pulse: true },
        { label: "Activity Log", path: "/activity-log", icon: History, visible: isAdminOrManager },
      ],
    },
  ];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#010102] text-[#f7f8f8] overflow-hidden select-none">
      <aside className="w-14 md:w-48 flex flex-col border-r border-[#23252a]/80 bg-[#010102]/95 backdrop-blur-sm flex-shrink-0">
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-3 md:px-4 border-b border-[#23252a]/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <motion.div 
              className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0f1011] to-[#18191a] border border-[#23252a] flex items-center justify-center flex-shrink-0 p-1.5"
              whileHover={{ scale: 1.05, rotate: 2 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <img src={recoveriqLogo} alt="RecoverIQ Logo" className="h-full w-full object-contain" />
            </motion.div>
            <span className="text-[15px] font-semibold text-[#f7f8f8] tracking-tight hidden md:block truncate">
              RecoverIQ
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-4 px-2 py-3 overflow-y-auto overflow-x-hidden thin-scrollbar">
          {navGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => item.visible !== false);
            if (visibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-0.5">
                {group.title && (
                  <div className="px-2.5 pt-2 pb-1 hidden md:block">
                    <span className="text-[11px] font-semibold text-[#62666d] tracking-wider uppercase">
                      {group.title}
                    </span>
                  </div>
                )}
                {group.title && groupIdx > 0 && (
                  <div className="md:hidden my-2 border-t border-[#23252a]/40" />
                )}

                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      className="block relative"
                      title={item.label}
                    >
                      <motion.div
                        className={`flex items-center justify-center md:justify-start rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150 relative ${
                          isActive
                            ? "bg-[#18191c] text-[#f7f8f8] shadow-xs border border-[#26282e]"
                            : "text-[#8a8f98] hover:bg-[#121316] hover:text-[#f7f8f8] border border-transparent"
                        }`}
                        whileHover={{ x: 2 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <motion.div
                            layoutId="nav-active-indicator"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400"
                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          />
                        )}
                        <Icon className="h-4 w-4 flex-shrink-0 stroke-[1.8]" />
                        <span className="hidden md:block ml-2.5 truncate">{item.label}</span>
                        {item.pulse && (
                          <div className="hidden md:block ml-auto">
                            <StatusPulse color="cyan" size="sm" />
                          </div>
                        )}
                      </motion.div>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Settings */}
        {isNotViewer && (
          <div className="p-2 border-t border-[#23252a]/60">
            <NavLink
              to="/settings"
              className="block"
              title="Settings"
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex items-center justify-center md:justify-start rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-[#18191c] text-[#f7f8f8] shadow-xs border border-[#26282e]"
                      : "text-[#8a8f98] hover:bg-[#121316] hover:text-[#f7f8f8] border border-transparent"
                  }`}
                  whileHover={{ x: 2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <Settings className="h-4 w-4 flex-shrink-0 stroke-[1.8]" />
                  <span className="hidden md:block ml-2.5 truncate">Settings</span>
                </motion.div>
              )}
            </NavLink>
          </div>
        )}
      </aside>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col w-full bg-[#010102]">
        <motion.div 
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex-1 min-h-0 h-full p-4 md:p-6 overflow-auto flex flex-col bg-transparent"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
