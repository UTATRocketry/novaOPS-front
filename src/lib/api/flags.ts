import { novaFetch } from "./novaFetch";

/** Enable or disable calibration/conversion for incoming engine sensor data. */
export function setCalibration(
  enabled: boolean,
): Promise<{ calibration_enabled: boolean }> {
  return novaFetch<{ calibration_enabled: boolean }>("/api/flags/calibration", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

/** Start or stop backend data saving via MQTT. */
export function setDataSaving(
  enabled: boolean,
): Promise<{ data_saving_enabled: boolean }> {
  return novaFetch<{ data_saving_enabled: boolean }>("/api/flags/data-saving", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
