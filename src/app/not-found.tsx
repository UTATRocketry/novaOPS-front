import { HomeButton, StatusPage } from "@/components/shell/StatusPage";

export default function NotFoundPage() {
  return (
    <StatusPage
      icon="search_off"
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    >
      <HomeButton />
    </StatusPage>
  );
}
