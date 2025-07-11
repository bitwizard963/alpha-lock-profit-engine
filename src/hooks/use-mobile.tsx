import * as React from "react"

// Dynamic mobile breakpoint based on device capabilities
const getOptimalBreakpoint = (): number => {
  // Check for touch capability and screen size
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const screenWidth = window.screen.width;
  
  // Adaptive breakpoint based on device characteristics
  if (hasTouch && screenWidth <= 480) return 480; // Small phones
  if (hasTouch && screenWidth <= 768) return 768; // Tablets
  if (screenWidth <= 1024) return 1024; // Small laptops
  
  return 768; // Default fallback
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
  const [breakpoint, setBreakpoint] = React.useState<number>(768)

  React.useEffect(() => {
    // Set optimal breakpoint on mount
    const optimalBreakpoint = getOptimalBreakpoint();
    setBreakpoint(optimalBreakpoint);
    
    const mql = window.matchMedia(`(max-width: ${optimalBreakpoint - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < optimalBreakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < optimalBreakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
