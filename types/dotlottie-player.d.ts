import type React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "dotlottie-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: string | boolean;
          loop?: string | boolean;
          background?: string;
          speed?: number;
        },
        HTMLElement
      >;
      "dotlottie-wc": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: string | boolean;
          loop?: string | boolean;
          background?: string;
          speed?: number;
        },
        HTMLElement
      >;
    }
  }
}
