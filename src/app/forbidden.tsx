import { HomeButton, StatusPage } from "@/components/shell/StatusPage";

export default function ForbiddenPage() {
  return (
    <StatusPage
      icon="lock"
      iconColor="warn"
      code="403"
      title="Access forbidden"
      description="You don't have permission to view this page. Request a higher role using the role selector in the top bar."
    >
      <HomeButton />
    </StatusPage>
  );
}
