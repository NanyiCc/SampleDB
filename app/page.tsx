import Workspace from "./components/workspace";
import LegacyHome from "./components/legacy-home";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  if (
    page &&
    ["inventory", "sampling", "experiments", "query", "edit", "users"].includes(
      page,
    )
  )
    return <LegacyHome />;
  return <Workspace />;
}
