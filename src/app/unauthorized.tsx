import { HomeButton, StatusPage } from "@/components/shell/StatusPage";

export default function UnauthorizedPage() {
  return (
    <StatusPage
      icon="person_off"
      iconColor="text.muted"
      code="401"
      title="Unauthorised"
      description="You need an active session to view this page. Connect to the backend and select a role using the role selector in the top bar."
    >
      <HomeButton />
    </StatusPage>
  );
}
