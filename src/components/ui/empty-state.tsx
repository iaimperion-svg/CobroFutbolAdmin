export function EmptyState(props: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <article className="app-card empty-state">
      <div className="stack" style={{ gap: 10 }}>
        <strong>{props.title}</strong>
        <p className="muted" style={{ margin: 0 }}>
          {props.description}
        </p>
        {props.actionHref && props.actionLabel ? (
          <div>
            <a className="button-secondary button-small" href={props.actionHref}>
              {props.actionLabel}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}
