import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home, FileText, Bot, BarChart3, Settings, History,
  MessageSquare, CreditCard, TrendingUp, Search, Keyboard,
  ShieldCheck, Users, Sliders, AlertOctagon
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { CommandPalette } from "../components/common/CommandPalette";
import { KeyboardShortcutsModal } from "../components/common/KeyboardShortcutsModal";

interface NavGroup {
  title?: string;
  items: {
    label: string;
    path: string;
    icon: React.ElementType;
    visible?: boolean;
    badge?: string;
  }[];
}

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const isNotViewer = user?.role !== 'viewer';

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === "?" && !isInput) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navGroups: NavGroup[] = [
    {
      title: "OPERATIONS",
      items: [
        { label: "Home", path: "/", icon: Home, visible: true },
        { label: "Recovery Queue", path: "/recovery", icon: TrendingUp, visible: true },
        { label: "Customers", path: "/customers", icon: Users, visible: true },
        { label: "Invoices", path: "/invoices", icon: FileText, visible: true },
      ],
    },
    {
      title: "AUTOMATION & POLICY",
      items: [
        { label: "Autopilot", path: "/agent", icon: Bot, visible: true },
        { label: "DLQ", path: "/dlq", icon: AlertOctagon, visible: isAdminOrManager },
        { label: "Workflows & Policy", path: "/workflows", icon: Sliders, visible: true },
      ],
    },
    {
      title: "INTELLIGENCE & TRUST",
      items: [
        { label: "Analytics", path: "/analytics", icon: BarChart3, visible: true },
        { label: "Audit & Trust Center", path: "/audit", icon: ShieldCheck, visible: true },
        { label: "Inquiries", path: "/disputes", icon: MessageSquare, visible: isAdminOrManager },
        { label: "Payment Plans", path: "/payment-plans", icon: CreditCard, visible: isAdminOrManager },
        { label: "Activity Log", path: "/activity-log", icon: History, visible: isAdminOrManager },
      ],
    },
  ];

  return (
    <div className="flex h-screen w-full bg-[#F8F7F4] text-[#1C1917] overflow-hidden select-none font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-16 md:w-56 flex flex-col border-r border-stone-200 bg-white flex-shrink-0 z-30 shadow-xs">
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between px-3 md:px-4 border-b border-stone-200 bg-stone-50/70">
          <div 
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 overflow-hidden cursor-pointer"
            title="PayBack-AI Recovery Operations"
          >
            <div className="h-7 w-7 rounded-md bg-[#991B1B] text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0">
              P
            </div>
            <div className="hidden md:block truncate">
              <div className="text-xs font-bold text-stone-900 tracking-tight leading-none">
                PayBack-AI
              </div>
              <div className="text-[10px] text-stone-500 font-medium tracking-wide mt-0.5">
                Recovery Operations
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-4 px-2 py-3 overflow-y-auto overflow-x-hidden thin-scrollbar">
          {navGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => item.visible !== false);
            if (visibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-0.5">
                {group.title && (
                  <div className="px-2.5 pt-2 pb-1 hidden md:block">
                    <span className="text-[10px] font-semibold text-stone-600 tracking-wider uppercase">
                      {group.title}
                    </span>
                  </div>
                )}
                {group.title && groupIdx > 0 && (
                  <div className="md:hidden my-2 border-t border-stone-200" />
                )}

                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.path === "/"
                    ? location.pathname === "/" || location.pathname === "/overview"
                    : location.pathname.startsWith(item.path);

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      className="block relative"
                      title={item.label}
                    >
                      <div
                        className={`flex items-center justify-center md:justify-start rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-100 relative ${
                          isActive
                            ? "bg-stone-100 text-stone-900 font-semibold border border-stone-200 shadow-2xs"
                            : "text-stone-700 hover:bg-stone-50 hover:text-stone-900 border border-transparent"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-r bg-[#991B1B]" />
                        )}
                        <Icon className={`h-4 w-4 flex-shrink-0 stroke-[1.8] ${isActive ? "text-[#991B1B]" : "text-stone-600"}`} />
                        <span className="hidden md:block ml-2.5 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="hidden md:inline-block ml-auto text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-mono">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Settings Footer */}
        {isNotViewer && (
          <div className="p-2 border-t border-stone-200 bg-stone-50/50">
            <NavLink
              to="/settings"
              className="block"
              title="Settings"
            >
              {({ isActive }) => (
                <div
                  className={`flex items-center justify-center md:justify-start rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-100 ${
                    isActive
                      ? "bg-stone-100 text-stone-900 font-semibold border border-stone-200"
                      : "text-stone-700 hover:bg-stone-50 hover:text-stone-900 border border-transparent"
                  }`}
                >
                  <Settings className={`h-4 w-4 flex-shrink-0 stroke-[1.8] ${isActive ? "text-[#991B1B]" : "text-stone-600"}`} />
                  <span className="hidden md:block ml-2.5 truncate">Settings</span>
                </div>
              )}
            </NavLink>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col w-full bg-[#F8F7F4]">
        {/* Universal Top Header */}
        <header className="h-14 border-b border-stone-200 bg-white px-4 md:px-6 flex items-center justify-between flex-shrink-0 z-20 shadow-2xs">
          {/* Quick Search */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-stone-50 hover:bg-stone-100 border border-stone-300 text-xs text-stone-600 hover:text-stone-900 transition-colors shadow-2xs group"
              title="Command Palette (Ctrl+K or ⌘K)"
            >
              <Search className="w-3.5 h-3.5 text-stone-500 group-hover:text-stone-700" />
              <span className="hidden sm:inline">Search invoices, debtors, commands...</span>
              <span className="sm:hidden">Search...</span>
              <kbd className="text-[10px] font-mono bg-white text-stone-600 px-1.5 py-0.5 rounded border border-stone-200 ml-1">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2.5">
            {/* Direct Link to Recovery Queue */}
            <button
              onClick={() => navigate("/recovery")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-200 text-xs font-medium transition-colors"
              title="Jump to Recovery Queue"
            >
              <TrendingUp className="w-3.5 h-3.5 text-[#991B1B]" />
              <span className="hidden sm:inline">Recovery Queue</span>
            </button>

            {/* Keyboard Shortcuts Trigger */}
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="p-1.5 rounded-md bg-stone-50 hover:bg-stone-100 border border-stone-300 text-stone-600 hover:text-stone-900 transition-colors"
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* User Account / Role */}
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
              <div className="w-7 h-7 rounded-full bg-stone-800 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                {user?.name?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-semibold text-stone-900 truncate max-w-[120px]">{user?.name || "Admin"}</div>
                <div className="text-[10px] text-stone-500 capitalize">{user?.role || "Operations Lead"}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Container */}
        <div className="flex-1 min-h-0 h-full p-4 md:p-6 overflow-auto flex flex-col bg-[#F8F7F4]">
          <Outlet />
        </div>

        {/* Global Modals */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
        <KeyboardShortcutsModal
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />
      </main>
    </div>
  );
}
