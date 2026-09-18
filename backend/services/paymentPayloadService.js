const {
  getLocalTransactionTime,
  getLocalTransactionDate,
  formatAmount,
  getCardType
} = require("./paymentHelpersService");

function buildBasePayload() {
  return {
    MessageTypeId: "",
    ProcessingCode: "",
    SystemsTraceNo: "",
    TimeLocalTrans: getLocalTransactionTime(),
    DateLocalTrans: getLocalTransactionDate(),
    PosEntryMode: "012",
    Nii: "003",
    PosConditionCode: "00",
    AdditionalData: "",
    OrderInformation: "",
    FormatId: "1",
    Merchant: {
      TerminalId: process.env.NEOPAY_TERMINAL_ID,
      CardAcqId: process.env.NEOPAY_CARD_ACQ_ID
    },
    Card: {
      Type: "",
      PrimaryAcctNum: "",
      DateExpiration: "",
      Cvv2: "",
      Track2Data: "",
      CardTokenId: "",
      UniqueCodeofBeneciary: ""
    },
    Amount: {
      AmountTrans: "",
      AmountDiscount: "",
      RateDiscount: "",
      AdditionalAmounts: "",
      TaxDetail: []
    },
    PrivateUse60: { BatchNumber: "" },
    PrivateUse63: {
      LodgingFolioNumber14: "",
      NationalCard25: "",
      HostReferenceData31: "",
      TaxAmount1: ""
    },
    TokenManagement: { Type: "", ActionMethod: "" },
    Customer: {
      CustomerTokenId: "",
      FirstName: "",
      LastName: "",
      TaxId: "",
      IdentificationType: "",
      PersonalId: "",
      Email: "",
      PhoneNumber: ""
    },
    BillTo: {
      FirstName: "",
      LastName: "",
      Company: "",
      AddressOne: "",
      AddressTwo: "",
      Locality: "",
      AdministrativeArea: "",
      PostalCode: "",
      Country: "",
      Email: "",
      PhoneNumber: ""
    },
    ShipTo: {
      DefaultSt: "",
      FirstName: "",
      LastName: "",
      Company: "",
      AddressOne: "",
      AddressTwo: "",
      Locality: "",
      AdministrativeArea: "",
      PostalCode: "",
      Country: "",
      Email: "",
      PhoneNumber: "",
      ShippingAddressTokenId: ""
    },
    PaymentInstrument: { PaymentInstrumentTokenId: "" },
    CustomerPaymentInstrument: {
      CustomerPaymentInstrumentTokenId: "",
      DefaultCpi: ""
    },
    PayerAuthentication: {
      Step: "",
      UrlCommerce: "",
      ReferenceId: "",
      browserLanguage: "",
      browserUserAgent: "",
      browserAcceptHeader: "",
      browserScreenWidth: "",
      browserScreenHeight: "",
      browserColorDepth: "",
      browserJavaEnabled: "",
      browserTZ: ""
    }
  };
}

function buildStandardSalePayload({
  systemsTraceNo,
  amount,
  sanitizedCardNumber,
  normalizedExpiration,
  sanitizedCvv
}) {
  const payload = buildBasePayload();
  payload.MessageTypeId = "0200";
  payload.ProcessingCode = "000000";
  payload.SystemsTraceNo = systemsTraceNo;
  payload.Card.Type = getCardType(sanitizedCardNumber);
  payload.Card.PrimaryAcctNum = sanitizedCardNumber;
  payload.Card.DateExpiration = normalizedExpiration;
  payload.Card.Cvv2 = sanitizedCvv;
  payload.Amount.AmountTrans = formatAmount(amount);
  payload.PayerAuthentication = {
    Step: "",
    UrlCommerce: "",
    ReferenceId: ""
  };
  return payload;
}

module.exports = {
  buildBasePayload,
  buildStandardSalePayload
};
