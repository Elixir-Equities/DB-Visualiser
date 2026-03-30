import { AppProvider } from './context/AppContext.jsx'
import MainPage from './pages/MainPage.jsx'

export default function App() {
  return (
    <AppProvider>
      <MainPage />
    </AppProvider>
  )
}
