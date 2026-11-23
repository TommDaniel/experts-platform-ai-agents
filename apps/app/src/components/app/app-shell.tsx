import { Link, Outlet, useLocation } from "react-router-dom";
import {
  BrainCircuit,
  ChevronRight,
  ChevronsUpDown,
  Home as HomeIcon,
  LogOut,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@repo/ui/components/ui/sidebar";
import { useAuth } from "../../contexts/auth-context";

const NAV_ITEMS = [
  { to: "/app", label: "Home", icon: HomeIcon },
  { to: "/app/experts", label: "Experts", icon: Sparkles },
  { to: "/app/connectors", label: "Connectors", icon: PlugZap },
];

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isCurrentPath(to: string, pathname: string): boolean {
  return to === "/app" ? pathname === to : pathname.startsWith(to);
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const currentPage = NAV_ITEMS.find((item) => isCurrentPath(item.to, location.pathname));
  const pageTitle = currentPage?.label ?? "Coders University";
  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
  const accountInitials = initials(displayName || user?.email || "?");

  return (
    <div className="flex h-svh overflow-hidden bg-app-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 z-50 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        Skip to main content
      </a>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="p-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  asChild
                  className="h-12 gap-3 hover:bg-transparent data-[active=true]:bg-transparent"
                >
                  <Link to="/app">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-soft-blush/80 text-ink shadow-xs ring-1 ring-ink/5 ring-inset">
                      <BrainCircuit className="size-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-display text-sm font-semibold tracking-tight">
                        Coders University
                      </span>
                      <span className="truncate text-[11px] font-normal text-muted-foreground">
                        Leadership, on call.
                      </span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className="px-1">
            <SidebarGroup>
              <SidebarGroupLabel className="eyebrow px-2 text-[10px] tracking-[0.18em]">
                Workspace
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {NAV_ITEMS.map((item) => {
                    const isActive = currentPage?.to === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className="h-9 rounded-xl data-[active=true]:bg-card data-[active=true]:shadow-xs"
                        >
                          <Link to={item.to} aria-current={isActive ? "page" : undefined}>
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="gap-2 border-t border-sidebar-border/70 p-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 px-2 py-2 group-data-[collapsible=icon]:hidden">
              <Avatar className="size-8">
                <AvatarFallback className="bg-powder-blue/60 text-[10px] font-semibold text-ink">
                  {accountInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-ink">
                  Signed in as {user?.firstName ?? "guest"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Sign out" className="h-9 rounded-xl">
                  <button type="button" aria-label="Sign out" onClick={() => void signOut()}>
                    <LogOut aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset id="main-content" tabIndex={-1} className="app-canvas min-h-0">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-app-rule/80 bg-app-canvas/85 px-4 backdrop-blur sm:px-6">
            <SidebarTrigger className="text-ink" />
            <span className="h-5 w-px bg-app-rule" aria-hidden="true" />
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2 text-sm">
                <li className="hidden text-muted-foreground sm:block">Workspace</li>
                <li aria-hidden="true" className="hidden sm:block">
                  <ChevronRight className="size-3.5 text-muted-foreground/70" />
                </li>
                <li
                  aria-current="page"
                  className="truncate font-display text-sm font-semibold text-ink"
                >
                  {pageTitle}
                </li>
              </ol>
            </nav>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 gap-2 rounded-full py-1 pr-2 pl-1"
                    aria-label="Account menu"
                  >
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-powder-blue/60 text-[10px] font-semibold text-ink">
                        {accountInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-32 truncate text-sm sm:inline">
                      {user?.firstName}
                    </span>
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
                    <LogOut aria-hidden="true" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
