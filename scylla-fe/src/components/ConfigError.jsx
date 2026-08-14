/**
 * Shown when the app has no usable backend configuration.
 *
 * Deliberately generic: it must not reveal which mode the app is in or which
 * variable is missing. Developers learn the setup from the code and
 * .env.example, never from the running app.
 */
export default function ConfigError() {
  return (
    <div className="h-screen w-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <svg
          className="w-8 h-8 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <h1 className="text-sm font-medium text-gray-300">
          Server configuration error
        </h1>
        <p className="text-xs text-gray-600 leading-relaxed">
          This application is not configured correctly and cannot be loaded.
          Please contact your administrator.
        </p>
      </div>
    </div>
  )
}
