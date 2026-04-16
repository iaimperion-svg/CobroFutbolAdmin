import Image from "next/image";

type BrandMarkProps = {
  compact?: boolean;
  subtitle?: string;
  variant?: "light" | "dark";
  src?: string;
  trimTransparentPadding?: boolean;
};

export function BrandMark(props: BrandMarkProps) {
  const compact = props.compact ?? false;
  const variant = props.variant ?? "light";
  const src = props.src ?? "/brand/logo.png";
  const trimTransparentPadding = props.trimTransparentPadding ?? true;
  const logoWidth = compact ? 176 : 300;
  const logoHeight = compact ? 62 : 84;

  return (
    <div className={`brand-lockup ${compact ? "compact" : "full"} ${variant}`}>
      <div className={`brand-lockup-row ${compact ? "compact" : "full"}`}>
        <Image
          src={src}
          alt="CobroFutbol"
          width={logoWidth}
          height={logoHeight}
          priority={!compact}
          className={`brand-asset-logo${trimTransparentPadding ? " trim-transparent-padding" : ""}`}
        />
      </div>
      {props.subtitle ? <p className="brand-lockup-subtitle">{props.subtitle}</p> : null}
    </div>
  );
}
