import { redirect } from "next/navigation";

export default function StudioRedirectPage({ params }: { params: { modelId: string } }) {
  redirect(`/models/${encodeURIComponent(params.modelId)}?tab=studio`);
}
