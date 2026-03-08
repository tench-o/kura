interface ToastProps {
  toast: { message: string; type: "success" | "error" } | null;
}

export function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div className={`toast show ${toast.type === "error" ? "error" : ""}`}>
      {toast.message}
    </div>
  );
}
