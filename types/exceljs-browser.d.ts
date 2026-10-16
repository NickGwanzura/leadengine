declare module 'exceljs/dist/exceljs.min.js' {
  export { Workbook } from 'exceljs';
  const ExcelJS: typeof import('exceljs');
  export default ExcelJS;
}
