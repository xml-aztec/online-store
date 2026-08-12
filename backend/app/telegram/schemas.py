from pydantic import BaseModel, ConfigDict, Field


class TelegramChat(BaseModel):
    id: int


class TelegramFrom(BaseModel):
    id: int


class TelegramMessage(BaseModel):
    message_id: int
    chat: TelegramChat
    text: str | None = None


class TelegramCallbackQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    from_: TelegramFrom = Field(alias="from")
    message: TelegramMessage | None = None
    data: str | None = None


class TelegramUpdate(BaseModel):
    """Only the fields app/telegram/service.py actually reads -- Telegram's real
    Update payload has many more (edited_message, channel_post, ...), all
    irrelevant to this bot and left unparsed by extra="ignore" (pydantic v2
    default)."""

    update_id: int
    message: TelegramMessage | None = None
    callback_query: TelegramCallbackQuery | None = None


class AdminTelegramLinkResponse(BaseModel):
    link_url: str
