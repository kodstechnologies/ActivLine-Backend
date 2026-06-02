export const SMS_TEMPLATE_ID = {
  WELCOM_SMS: () => ({
    ID: "1507165416428327948",
    MESSAGE: `Dear Customer Welcome to Activline Telecom, Your account has been registered with us. Helpline 24*7 For any details Contact: / 18002586488 / 08049796488 Whatsapp no. 9535996488 / 9972356488 Please feel free to contact our service, Regards ATPL`,
  }),

  OTP_SMS: (OTP, EXPIRE) => ({
    ID: "",
    MESSAGE: () =>
      `Your OTP is ${OTP}. It is valid for ${EXPIRE} minutes. Please do not share this code with anyone.`,
  }),

  ACCOUNT_SUSPENDED: () => ({
    ID: "1507165466838223337",
    MESSAGE: `Your account has been suspended. Please contact our support team for further assistance.`,
  }),

  EXPIRE_NOTIFY: (EXPIRY, PAYMENT_LINK) => ({
    ID: "1507167402415367993",
    MESSAGE: `Dear Customer, Your account will be expired on ${EXPIRY}.Please renew the same to avoid disconnection,  Payment Activation Link : ${PAYMENT_LINK}. If you paid kindly neglect. Regards Activline`,
  }),

  EXPIRY_NOTIFICATION_NEXT_DAY_NEW: (EXPIRY_DATE, EXPIRY_TIME) => ({
    ID: "1507167402696641637",
    MESSAGE: `Dear Customer, Your account will be expired on ${EXPIRY_DATE} ${EXPIRY_TIME} itself .Please renew the same to avoid disconnection. If you have renewed Kindly Ignore. - Activline`,
  }),

  USER_CHANGE_PASSWORD_ALERT: (USER_NAME, NEW_PASSWORD) => ({
    ID: "1007051571926313977",
    MESSAGE: `Hi ${USER_NAME}, Your account password has been changed. New password is ${NEW_PASSWORD} Activline Telecom`,
  }),

  PAYMENT_REMINDER_NEW: (EXPIRY_DATE, PAYMENT_LINK, UTILS_LINK) => ({
    ID: "1007405859397964549",
    MESSAGE: `Dear Sir/Madam, Your plan will expire on ${EXPIRY_DATE}  to continue with uninterrupted services, Kindly recharge Online recharge procedure: check account details, payment process, invoice, etc., in the below URL.  Kindly make payment through the below-mentioned link only. ${PAYMENT_LINK}${UTILS_LINK} , Kindly ignore, if already paid - Activline`,
  }),

  MAINTENANCE_ACTIVITY_NOTIFICATION: (DATE, TIME_RANGE) => ({
    ID: "1007859168923877484",
    MESSAGE: `Dear customer, we have planned annual emergency Network Maintenance activity on ${DATE}, in between ${TIME_RANGE}. You may possibly experience connectivity issues/ speed issues during this Maintenance Activity. We regret the inconvenience caused to you. Helpline 24*7 no 9535996488, 9972356488,1800 258 6488. Regards,Team Activline`,
  }),

  GRANT_ACCESS: (USER_ID, PASSWORD, REGISTERED_DATE, PLAN) => ({
    ID: "1007702880194980541",
    MESSAGE: `Dear Customer Welcome to Activline Telecom, Your account has been registered with ID ${USER_ID} password:${PASSWORD} Registered Dt:${REGISTERED_DATE} Plan ${PLAN}`,
  }),

  NEW_LEAD: (TRACKING_ID) => ({
    ID: "1007737319426483773",
    MESSAGE: `Hello, your request for new Internet connection is under process. Your request tracking ID is${TRACKING_ID} Activline Telecom`,
  }),

  TICKET_OVERDUE_NOTIFICATION: (USER_NAME, TICKET_ID) => ({
    ID: "1007631290580679158",
    MESSAGE: `Hi ${USER_NAME}, Ticket with ID ${TICKET_ID} is overdue. Activline Telecom`,
  }),

  RAISE_TICKET_NOTIFICATION: (USER_NAME, TICKET_ID, ISSUE) => ({
    ID: "1007874365648372306",
    MESSAGE: `Username ${USER_NAME} - A ticket with an ID ${TICKET_ID} and issue ${ISSUE} has been raised. Activline Telecom`,
  }),

  REFERAL_OFFER: (USER_NAME) => ({
    ID: "1007192409609561682",
    MESSAGE: `Hi ${USER_NAME}, You have received an offer for one of your referral at Activline Telecom`,
  }),

  TICKETS_MESSAGE: (TICKET_ID, USER_NAME) => ({
    ID: "1007310417752837809",
    MESSAGE: `Ticket with an ID ${TICKET_ID} from the username ${USER_NAME} has been updated Activline Telecom`,
  }),

  REJECT_USER: (LOCATION, USER_NAME) => ({
    ID: "1007194308141133226",
    MESSAGE: `Your request to access the internet at ${LOCATION} with the username ${USER_NAME} has been rejected.Please contact your network administrator for details. Activline Telecom`,
  }),

  FRANCHISE_INVOICE: (AMOUNT) => ({
    ID: "1007591279510636081",
    MESSAGE: `Hello, Please pay the outstanding amount of ${AMOUNT} against the invoice sent for account balance TopUp. Invoice has been sent via e-mail. Activline Telecom`,
  }),

  REOPEN_TICKET_NOTIFICATION: (USER_NAME, TICKET_ID, TIMES) => ({
    ID: "1007359755495175417",
    MESSAGE: `Hi ${USER_NAME}, Ticket with ID ${TICKET_ID} has been reopened ${TIMES} times. Activline Telecom`,
  }),

  EXPIRY_NOTIFICATION_BEFORE_3_DAYS_NEW: (EXPIRY_DATE, IGNORE_TXT) => ({
    ID: "1007976376911943625",
    MESSAGE: `Dear Customer, Your account will be expired on${EXPIRY_DATE}.Please renew the same to avoid disconnection, If you paid Kindly ${IGNORE_TXT}. Regards Activline`,
  }),

  EXPIRY_NOTIFICATION_ON_DAY_NEW: (EXPIRY_DATE, IGNORE_TXT) => ({
    ID: "1007724395657853851",
    MESSAGE: `Dear Customer, Your account will be expired on today${EXPIRY_DATE} itself .Please renew the same to avoid disconnection. If you renewed Kindly ${IGNORE_TXT}. Regards Actvline`,
  }),

  ACTIVLINE_NEW_1: (PACKAGE, DATE) => ({
    ID: "1007147333747984367",
    MESSAGE: `Dear Customer, Your account has been renewed with package ${PACKAGE} on ${DATE}. Thanks for the renewal from Activline Telecom`,
  }),

  ACTIVE_LINE_NEW: (EXPIRY_DATE, EXPIRY_TIME, IGNORE_TXT) => ({
    ID: "1007929755686729498",
    MESSAGE: `Dear Customer, Your account will be expired on ${EXPIRY_DATE} ${EXPIRY_TIME} itself .Please renew the same to avoid disconnection. If you have renewed Kindly ${IGNORE_TXT}. – Activline.`,
  }),

  FREQUENT_DISCONNECTION: (DATE, TICKET_NUMBER) => ({
    ID: "1007890356445289400",
    MESSAGE: `Dear customer, As per your complaint regarding frequent disconnection  on ${DATE} we raised a ticket for the same. Ticket number is ${TICKET_NUMBER}Regards Activline Telecom`,
  }),

  CLOSE_TICKET_NOTIFICATION_ADMIN: (
    ADMIN_NAME,
    TICKET_ID,
    ISSUE,
    USER_NAME,
  ) => ({
    ID: "1007673062998760023",
    MESSAGE: `Hello ${ADMIN_NAME}, The Ticket ${TICKET_ID} raised with the issue ${ISSUE} from the user ${USER_NAME} has been closed successfully. Activline Telecom`,
  }),

  CLOSE_TICKET_NOTIFICATION: (USER_NAME, TICKET_ID) => ({
    ID: "1007423151190412411",
    MESSAGE: `Username ${USER_NAME} - The ticket with the ID ${TICKET_ID} has been closed successfully. Activline Telecom`,
  }),

  ACCOUNT_SUSPENSION: (AMOUNT) => ({
    ID: "1007341136662961879",
    MESSAGE: `Your account has been suspended due to non-payment of bill. Please pay your bill of ${AMOUNT} immediately to re-activate your account. Activline Telecom`,
  }),

  ASSIGN_LEADS: (LEAD_NAME, LOCATION) => ({
    ID: "1007029526247495575",
    MESSAGE: `You have been assigned to a new lead named ${LEAD_NAME} in ${LOCATION}. Activline Telecom`,
  }),

  FRANCHISE_PAYMENT: (AMOUNT) => ({
    ID: "1007938326294313100",
    MESSAGE: `Your payment of Rs.${AMOUNT} has been received by  Activline Telecom`,
  }),

  FRANCHISE_PAYMENT_NEW: (AMOUNT) => ({
    ID: "1007389730932776175",
    MESSAGE: `Your payment of Rs.${AMOUNT} has been received by Activline`,
  }),

  FRANCHISE_PAYMENT_NEW_2: (AMOUNT) => ({
    ID: "1007804554160398352",
    MESSAGE: `Your payment of Rs.${AMOUNT} has been received by Activline`,
  }),

  FRANCHISE_PAYMENT_NEW_3: (AMOUNT) => ({
    ID: "1007481933726905196",
    MESSAGE: `Your payment of Rs.${AMOUNT} has been received by Activline`,
  }),

  RELOCATION_PENDING: (USER_NAME) => ({
    ID: "1007999888777666555", // Replace with actual DLT Template ID
    MESSAGE: `Dear Customer, your relocation request is pending approval. Regards, Activline Telecom`,
  }),

  RELOCATION_COMPLETED: (USER_NAME, ADDRESS) => ({
    ID: "1007111222333444555", // Replace with actual DLT Template ID
    MESSAGE: `Dear Customer, your relocation request to ${ADDRESS} has been completed successfully. Regards, Activline Telecom`,
  }),

  AGENT_AVAILABLE: (USER_NAME, START_TIME, END_TIME) => ({
    ID: "1007999888777666556", // Replace with actual DLT Template ID once registered
    MESSAGE: `Hi ${USER_NAME}, agent is available between ${START_TIME} to ${END_TIME} you can connect now.`,
  }),

  USAGE_ALERT: (PERCENTAGE, QUOTA) => ({
    ID: "1007840740120148532",
    MESSAGE: `Usage alert! You have consumed ${PERCENTAGE} % of  ${QUOTA} Internet usage quota at  Activline Telecom`,
  }),

  NOTIFY_INACTIVE_USER: (USER_NAME, DAYS) => ({
    ID: "1007624878970688068",
    MESSAGE: `Hi ${USER_NAME}, You are receiving this message because there has been no Internet usage for more than ${DAYS} days on your account. If you are facing any issues please contact us. Activline Telecom`,
  }),

  REJECT_LEAD: (USER_NAME, LEAD_NAME, LEAD_ID, REJECTED_BY) => ({
    ID: "1007792359909554963",
    MESSAGE: `Hi${USER_NAME}, Lead${LEAD_NAME} with Lead ID ${LEAD_ID} has been rejected by ${REJECTED_BY}. Activline Telecom`,
  }),

  FRANCHISE_INVOICE_NEW: (AMOUNT) => ({
    ID: "1007561355717066809",
    MESSAGE: `Hello, Please pay the outstanding amount of ${AMOUNT} against the invoice sent for account balance TopUp. Invoice has been sent via e-mail.  Activline Team`,
  }),

  ACCESS_POINT_CHANGE_STATE_NEW: (ADMIN_NAME, AP_NAME, STATUS, TIME) => ({
    ID: "1007082724845643001",
    MESSAGE: `Hello ${ADMIN_NAME}, Your ${AP_NAME} status have been changed to ${STATUS} at ${TIME} in Activline`,
  }),

  USAGE_ALERT_SUPPORT_TEAM: (PERCENTAGE, QUOTA) => ({
    ID: "1007843206826626485",
    MESSAGE: `Usage alert! You have consumed ${PERCENTAGE} % of ${QUOTA} Internet usage quota at Activline customer support Team.`,
  }),

  REFERRAL_OFFER_SUPPORT_TEAM: (USER_NAME) => ({
    ID: "1007781558303285421",
    MESSAGE: `Hi ${USER_NAME}, You have received an offer for one of your referral at Activline customer support Team.`,
  }),

  TICKET_OVERDUE_SUPPORT_TEAM: (USER_NAME, TICKET_ID) => ({
    ID: "1007473874284569960",
    MESSAGE: `Hi ${USER_NAME}, Ticket with ID ${TICKET_ID} is overdue. Activline customer support Team.`,
  }),

  NOTIFY_INACTIVE_USER_SUPPORT_TEAM: (USER_NAME, DAYS) => ({
    ID: "1007745168431303809",
    MESSAGE: `Hi ${USER_NAME}, You are receiving this message because there has been no Internet usage for more than ${DAYS} days on your account. If you are facing any issues please contact us. Activline customer support Team.`,
  }),

  RENEWAL_NEW: (USER_NAME, PACKAGE, DATE, SIGNATURE) => ({
    ID: "1007649910567254152",
    MESSAGE: `Dear ${USER_NAME}, Your account has been renewed with package ${PACKAGE} on ${DATE}. Thanks for the renewal Regards, ${SIGNATURE}-Activline.`,
  }),
};
