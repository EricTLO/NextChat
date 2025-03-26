import DeleteIcon from "../icons/delete.svg";

import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { Mask } from "../store/mask";
import { useRef, useEffect } from "react";
import { showConfirm } from "./ui-lib";
import { useMobileScreen } from "../utils";
import clsx from "clsx";
// 在你的某个组件文件或者一个工具文件中引入 store
import { createEmptySession } from "../store/chat"; // 根据你的实际路径修改

// 定义一个修复函数
function fixCurrentSessionIndex() {
  // 1. 只获取需要读取的状态
  const { sessions } = useChatStore.getState();

  const currentFullSessions = sessions;
  const visibleSessions = currentFullSessions.filter(session => !session.isDeleted);

  console.log("Current full sessions count:", currentFullSessions.length);
  console.log("Visible sessions count:", visibleSessions.length);

  if (visibleSessions.length > 0) {
    const firstVisibleSession = visibleSessions[0];
    const correctIndex = currentFullSessions.findIndex(session => session.id === firstVisibleSession.id);

    if (correctIndex !== -1) {
      console.log(`Found first visible session: ID=${firstVisibleSession.id}, Topic=${firstVisibleSession.topic}`);
      console.log(`Its correct index in the full list is: ${correctIndex}`);
      console.log(`Updating currentSessionIndex to ${correctIndex}`);

      // 2. 使用 useChatStore.setState() 来更新状态
      useChatStore.setState({ currentSessionIndex: correctIndex });

      console.log("Index updated successfully.");
    } else {
      console.error("Error: Could not find the first visible session in the full sessions list.");
       if (currentFullSessions.length > 0) {
           // 同样使用 setState 更新
           useChatStore.setState({ currentSessionIndex: 0 });
           console.warn("Fallback: Set index to 0.");
       } else {
           useChatStore.setState({ currentSessionIndex: -1 });
           console.warn("Fallback: Set index to -1 (empty list).");
       }
    }
  } else {
    console.log("No visible sessions found. Resetting to a new empty session.");
    const newEmptySession = createEmptySession(); // 确保 createEmptySession 导入正确

    // 同样使用 setState 更新
    useChatStore.setState({
      sessions: [newEmptySession],
      currentSessionIndex: 0,
    });

    console.log("Sessions reset to a single empty session.");
  }
}

// --- 如何调用这个函数 ---
// 方式一：在浏览器控制台调用 (需要确保这个函数在你的某个组件或全局作用域中可访问)
// window.fixMyIndex = fixCurrentSessionIndex; // 在组件中挂载到 window
// 然后在控制台输入: fixMyIndex()

// 方式二：临时添加一个按钮来调用
// 在你的某个组件的 JSX 中:
// <button onClick={fixCurrentSessionIndex}>修复索引</button>
export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  mask: Mask;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  const { pathname: currentPath } = useLocation();
  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <div
          className={clsx(styles["chat-item"], {
            [styles["chat-item-selected"]]:
              props.selected &&
              (currentPath === Path.Chat || currentPath === Path.Home),
          })}
          onClick={props.onClick}
          ref={(ele) => {
            draggableRef.current = ele;
            provided.innerRef(ele);
          }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          title={`${props.title}\n${Locale.ChatItem.ChatItemCount(
            props.count,
          )}`}
        >
          {props.narrow ? (
            <div className={styles["chat-item-narrow"]}>
              <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
                <MaskAvatar
                  avatar={props.mask.avatar}
                  model={props.mask.modelConfig.model}
                />
              </div>
              <div className={styles["chat-item-narrow-count"]}>
                {props.count}
              </div>
            </div>
          ) : (
            <>
              <div className={styles["chat-item-title"]}>{props.title}</div>
              <div className={styles["chat-item-info"]}>
                <div className={styles["chat-item-count"]}>
                  {Locale.ChatItem.ChatItemCount(props.count)}
                </div>
                <div className={styles["chat-item-date"]}>{props.time}</div>
              </div>
            </>
          )}

          <div
            className={styles["chat-item-delete"]}
            onClickCapture={(e) => {
              props.onDelete?.();
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function ChatList(props: { narrow?: boolean }) {
  const [sessions, selectedIndex, selectSession, moveSession] = useChatStore(
    (state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
      state.moveSession,
    ],
  );
  const chatStore = useChatStore();
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    moveSession(source.index, destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="chat-list">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {sessions
              .filter((item) => !item.isDeleted) // 过滤掉已删除的会话
              .map((item, i) => {
                // 计算未删除会话的索引
                const filteredIndex = sessions.slice(0, i + 1).filter((s) => !s.isDeleted).length - 1;
                return (
                  <ChatItem
                    title={item.topic}
                    time={new Date(item.lastUpdate).toLocaleString()}
                    count={item.messages.length}
                    key={item.id}
                    id={item.id}
                    index={filteredIndex}
                    selected={filteredIndex === selectedIndex}
                    onClick={() => {
                      navigate(Path.Chat);
                      selectSession(filteredIndex);
                    }}
                    onDelete={async () => {
                      if (
                        (!props.narrow && !isMobileScreen) ||
                        (await showConfirm(Locale.Home.DeleteChat))
                      ) {
                        chatStore.deleteSession(filteredIndex);
                      }
                    }}
                    narrow={props.narrow}
                    mask={item.mask}
                  />
                );
              })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
