import type { ReactElement, SVGProps } from "react";

/**
 * Inline SVG, decorative only: every icon is `aria-hidden` and every control
 * that uses one carries its own text or `aria-label`. Inline rather than an icon
 * font or sprite so nothing loads from the host page's origin.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Svg({
  size = 20,
  strokeWidth = 2,
  children,
  ...rest
}: IconProps & {
  size?: number;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const AskIcon = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M4 4h11l5 5v11H4z" />
    <path d="M15 4v5h5" />
    <path d="M8 13h8M8 17h5" />
  </Svg>
);

export const CloseIcon = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const DocIcon = (p: IconProps): ReactElement => (
  <Svg size={16} {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4" />
  </Svg>
);

export const ArrowIcon = (p: IconProps): ReactElement => (
  <Svg size={14} strokeWidth={2.2} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const SendIcon = (p: IconProps): ReactElement => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const CheckIcon = (p: IconProps): ReactElement => (
  <Svg size={12} strokeWidth={3} {...p}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);

export const PersonIcon = (p: IconProps): ReactElement => (
  <Svg size={16} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
);

export const GrowIcon = (p: IconProps): ReactElement => (
  <Svg size={16} {...p}>
    <path d="M12 20V10M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z" />
  </Svg>
);
