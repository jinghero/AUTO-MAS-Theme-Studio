// The offline preview only renders the task options; it has no backend API.
export interface ComboBoxItem {
  label: string
  value: string
  disabled?: boolean
}
