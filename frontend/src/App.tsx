import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import FundDetailPage from './pages/FundDetailPage'
import FundsPage from './pages/FundsPage'
import HoldingsPage from './pages/HoldingsPage'
import InsightsPage from './pages/InsightsPage'
import SecurityPage from './pages/SecurityPage'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<FundsPage />} />
          <Route path="/funds/:cik" element={<FundDetailPage />} />
          <Route path="/holdings" element={<HoldingsPage />} />
          <Route path="/holdings/:cik" element={<HoldingsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/security/:id" element={<SecurityPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
