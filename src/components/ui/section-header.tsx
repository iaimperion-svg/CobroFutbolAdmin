export function SectionHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "start" | "center";
}) {
  return (
    <div className={`section-copy${props.align === "center" ? " center" : ""}`}>
      <span className="eyebrow">{props.eyebrow}</span>
      <h1 className="app-title">{props.title}</h1>
      <p className="section-description">{props.description}</p>
    </div>
  );
}
