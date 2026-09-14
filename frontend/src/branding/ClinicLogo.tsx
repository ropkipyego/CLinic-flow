/**
 * ClinicLogo
 *
 * Renders the clinic mark from the painted sign:
 * house + medical cross + blue/red stethoscope.
 *
 * The clinic name is NOT drawn here. Names come from the tenant record
 * so another clinic can reuse the same software later.
 */
type ClinicLogoProps = {
  /** CSS size, for example "2.5rem" or 40 */
  size?: number | string;
  /** Extra Tailwind classes on the <img> */
  className?: string;
  /** Alternate text for screen readers */
  alt?: string;
};

export function ClinicLogo({ size = 40, className = "", alt = "Clinic logo" }: ClinicLogoProps) {
  // Number sizes become pixel values. Strings (rem/%) are used as-is.
  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <img
      src="/logo.png"
      alt={alt}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      className={`inline-block object-contain ${className}`}
      style={{ width: dimension, height: dimension }}
    />
  );
}
