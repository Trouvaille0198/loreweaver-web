import { useTranslation } from "react-i18next"
import type { CommandAnnotation } from "./commands"

/** Compact, shared badges for reply visibility and campaign-data effects. */
export default function CommandTags({ annotation }: { annotation: CommandAnnotation }) {
  const { t } = useTranslation()
  const dataKey =
    annotation.dataMode === "read"
      ? "play.commands.dataRead"
      : annotation.dataMode === "write"
        ? "play.commands.dataWrite"
        : "play.commands.dataMixed"
  const replyLabel = t(annotation.privateReply ? "play.commands.replyPrivate" : "play.commands.replyShared")
  const dataLabel = t(dataKey)
  return (
    <span className="command-tags" aria-label={`${replyLabel} ${dataLabel}`}>
      {" "}
      <span className={`command-tag command-tag--reply-${annotation.privateReply ? "private" : "shared"}`}>
        {replyLabel}
      </span>{" "}
      <span className={`command-tag command-tag--data-${annotation.dataMode}`}>{dataLabel}</span>
    </span>
  )
}
