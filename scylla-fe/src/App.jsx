import { CONFIG_OK } from './api/apiClient.js'
import ConfigError from './components/ConfigError.jsx'
import { AppProvider } from './context/AppContext.jsx'
import MainPage from './pages/MainPage.jsx'

export default function App() {
  // No reachable backend means every screen would fail anyway — show the
  // generic notice instead of a UI that 401s on each request.
  if (!CONFIG_OK) return <ConfigError />

  return (
    <AppProvider>
      <MainPage />
    </AppProvider>
  )
}
