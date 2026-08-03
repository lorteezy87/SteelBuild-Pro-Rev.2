declare module "@/components/shared/LoadingSkeleton" {
  export default function LoadingSkeleton(props: {
    variant?: string;
    rows?: number;
    count?: number;
  }): JSX.Element;
}

declare module "@/components/shared/LoadingSkeleton.jsx" {
  export default function LoadingSkeleton(props: {
    variant?: string;
    rows?: number;
    count?: number;
  }): JSX.Element;
}
