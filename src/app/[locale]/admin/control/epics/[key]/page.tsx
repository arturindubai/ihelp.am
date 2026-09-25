import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { getEpic } from "@/server/services/epics";
import { EPIC_STATUSES, STATUSES } from "@/lib/backlog-labels";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { EpicEditorForm } from "@/components/admin/cc/EpicEditorForm";
import { Attachments } from "@/components/admin/cc/Attachments";

export const dynamic = "force-dynamic";

export default async function EpicPage({ params }: { params: Promise<{ locale: string; key: string }> }) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const data = await getEpic(decodeURIComponent(key));
  if (!data) notFound();
  const { epic, blockers, blocking } = data;
  const t = await getTranslations("admin.cc");

  return (
    <div className="max-w-4xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control/epics" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            <span className="font-mono text-base text-muted">{epic.key}</span>
            {epic.title}
          </span>
        }
        sub={`${EPIC_STATUSES[epic.status]} · ${epic.source === "ui" ? t("form.sourceUi") : t("form.sourceCode")}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card title={epic.summary}>
            {epic.requirements.length > 0 && (
              <>
                <h3 className="h3 mb-2">{t("requirements")}</h3>
                <ul className="space-y-1.5 text-sm">
                  {epic.requirements.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted">{i + 1}.</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {epic.design && (
              <>
                <h3 className="h3 mt-4 mb-2">{t("form.design")}</h3>
                <p className="whitespace-pre-line text-sm">{epic.design}</p>
              </>
            )}
            {epic.techNotes && (
              <>
                <h3 className="h3 mt-4 mb-2">{t("form.techNotes")}</h3>
                <p className="whitespace-pre-line text-sm">{epic.techNotes}</p>
              </>
            )}
            {epic.testingNotes && (
              <>
                <h3 className="h3 mt-4 mb-2">{t("form.qaNotes")}</h3>
                <p className="whitespace-pre-line text-sm">{epic.testingNotes}</p>
              </>
            )}
            {epic.deployNotes && (
              <>
                <h3 className="h3 mt-4 mb-2">{t("form.deployNotes")}</h3>
                <p className="whitespace-pre-line text-sm">{epic.deployNotes}</p>
              </>
            )}
            {(blockers.length > 0 || blocking.length > 0 || epic.docs.length > 0) && (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {blockers.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("depends")}</div>
                    {blockers.map((b) => (
                      <Link key={b.key} href={`/admin/control/epics/${b.key}`} className="block">
                        <span className={b.status === "done" ? "text-ok" : "text-bad"}>●</span> {b.title}
                      </Link>
                    ))}
                  </div>
                )}
                {blocking.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("blocking")}</div>
                    {blocking.map((b) => (
                      <Link key={b.key} href={`/admin/control/epics/${b.key}`} className="block">
                        {b.title}
                      </Link>
                    ))}
                  </div>
                )}
                {epic.docs.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("docs")}</div>
                    {epic.docs.map((d) => (
                      <div key={d} className="font-mono text-xs">
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title={t("form.edit")} className="mt-4">
            <EpicEditorForm
              isNew={false}
              initial={{
                key: epic.key,
                title: epic.title,
                summary: epic.summary,
                requirements: epic.requirements.join("\n"),
                design: epic.design ?? "",
                techNotes: epic.techNotes ?? "",
                testingNotes: epic.testingNotes ?? "",
                deployNotes: epic.deployNotes ?? "",
                status: epic.status,
                depends: epic.depends.join("\n"),
                docs: epic.docs.join("\n"),
              }}
            />
          </Card>

          <Card title={t("form.files")}>
            <Attachments subject={{ epicKey: epic.key }} items={epic.attachments} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("epics.tasks")}>
            {epic.tasks.length === 0 && <p className="text-sm text-muted">{t("epics.noTasks")}</p>}
            <ul className="space-y-2 text-sm">
              {epic.tasks.map((tk) => (
                <li key={tk.key}>
                  <Link href={`/admin/control/${tk.key}`} className="block">
                    <span className={tk.status === "done" ? "text-ok" : "text-muted"}>●</span> <span className="font-mono text-xs">{tk.key}</span> {tk.title}
                    <span className="ml-1 text-xs text-muted">· {STATUSES[tk.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
