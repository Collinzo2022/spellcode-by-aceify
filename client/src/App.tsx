import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Access from "@/pages/Access";
import Admin from "@/pages/Admin";
import Auth from "@/pages/Auth";
import BeginnerLab from "@/pages/BeginnerLab";
import Certificate from "@/pages/Certificate";
import Curriculum from "@/pages/Curriculum";
import Daily from "@/pages/Daily";
import Dashboard from "@/pages/Dashboard";
import EmailConfirmed from "@/pages/EmailConfirmed";
import Home from "@/pages/Home";
import Lesson from "@/pages/Lesson";
import NotFound from "@/pages/NotFound";
import PaymentComplete from "@/pages/PaymentComplete";
import Profile from "@/pages/Profile";
import Projects from "@/pages/Projects";
import Tutor from "@/pages/Tutor";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route path="/auth/confirmed" component={EmailConfirmed} />
      <Route path="/beginner-lab" component={BeginnerLab} />
      <Route path="/today" component={Daily} />
      <Route path="/access" component={Access} />
      <Route path="/admin" component={Admin} />
      <Route path="/payment/complete" component={PaymentComplete} />
      <Route path="/curriculum" component={Curriculum} />
      <Route path="/learn/:track/:lessonId" component={Lesson} />
      <Route path="/projects" component={Projects} />
      <Route path="/tutor" component={Tutor} />
      <Route path="/certificate" component={Certificate} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/profile" component={Profile} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemedApplication() {
  const { theme } = useTheme();
  return (
    <div className="spellcode-route-frame min-h-screen" data-theme={theme}>
      <TooltipProvider>
        <Toaster richColors theme={theme} />
        <Router />
      </TooltipProvider>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <ThemedApplication />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
