import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Curriculum from "@/pages/Curriculum";
import Dashboard from "@/pages/Dashboard";
import Home from "@/pages/Home";
import Lesson from "@/pages/Lesson";
import NotFound from "@/pages/NotFound";
import Profile from "@/pages/Profile";
import Projects from "@/pages/Projects";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/curriculum" component={Curriculum} /><Route path="/learn/:track/:lessonId" component={Lesson} /><Route path="/projects" component={Projects} /><Route path="/dashboard" component={Dashboard} /><Route path="/profile" component={Profile} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster richColors theme="dark" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
