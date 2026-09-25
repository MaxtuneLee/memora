import { animate } from "animejs";
import { useEffect, useRef, type ReactElement } from "react";

import { prefersReducedMotion } from "./dots";

// The app icon (public/memora-icon.svg) drawn inline so its eyes can blink.
const BODY =
  "M121.502 199.5C139.502 176 215.002 73 215.002 73C215.002 73 242.62 118.52 255.679 152.999C289.287 122.53 356.696 85.3854 356.696 85.3854C356.696 85.3854 378.427 180.623 386.5 208.5C394.573 236.377 446.534 284.504 421.721 346.384C396.907 408.264 308.254 433.889 227.502 424.5C155.915 416.176 95.1283 374.239 76.5019 324C57.5369 272.848 103.502 223 121.502 199.5Z";
const EYES = [
  "M179.372 218.569C194.514 222.197 201.093 252.919 194.065 287.189C187.036 321.459 169.063 346.3 153.92 342.673C138.778 339.045 132.199 308.322 139.228 274.051C146.256 239.781 164.229 214.941 179.372 218.569Z",
  "M284.152 230.987C300.233 234.294 308.674 265.042 303.004 299.664C297.335 334.286 279.702 359.673 263.62 356.366C247.539 353.059 239.098 322.312 244.768 287.689C250.437 253.067 268.07 227.681 284.152 230.987Z",
];
const INK = "#1b1c16";

export function LogoMark({ size = 30 }: { size?: number }): ReactElement {
  const eyesRef = useRef<SVGGElement>(null);

  // Irregular blinks: a quick close, a slightly slower open, now and then a double blink.
  useEffect(() => {
    const eyes = eyesRef.current?.querySelectorAll("g");
    if (!eyes || prefersReducedMotion()) return;
    let timer = 0;
    const blink = (after?: () => void) =>
      animate(eyes, {
        scaleY: [
          { to: 0.08, duration: 70, ease: "in(2)" },
          { to: 1, duration: 130, ease: "out(2)" },
        ],
        onComplete: () => after?.(),
      });
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          blink(
            Math.random() < 0.2
              ? () => {
                  timer = window.setTimeout(() => blink(), 110);
                }
              : undefined,
          );
          schedule();
        },
        2500 + Math.random() * 4500,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 500 500" aria-hidden="true">
      <rect width="500" height="500" fill="#8EA06C" />
      <path d={BODY} fill={INK} stroke={INK} strokeWidth="20" strokeLinejoin="round" />
      <g ref={eyesRef}>
        {EYES.map((d) => (
          <g key={d} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <path d={d} fill="#fff" stroke="#fff" strokeWidth="30" strokeLinejoin="round" />
            <path d={d} fill={INK} />
          </g>
        ))}
      </g>
    </svg>
  );
}
