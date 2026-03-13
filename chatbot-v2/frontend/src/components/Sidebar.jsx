import { useLanguage } from '../context/LanguageContext.jsx';
import { useChatContext } from '../context/ChatContext.jsx';

export default function Sidebar({ phase }) {
  const { t } = useLanguage();
  const { sendMessage, status } = useChatContext();

  const isStreaming = status === 'streaming' || status === 'submitted';
  const questions = t(`questions.${phase}`);
  if (!Array.isArray(questions)) return null;

  const handleClick = (item) => {
    if (isStreaming) return;
    if (item.action === 'refresh') {
      location.reload();
      return;
    }
    sendMessage({ text: item.text });
  };

  return (
    <aside className="sidebar">
      <h3 className="sidebar-title">
        <span className="material-symbols">lightbulb</span>
        {t('questions.title')}
      </h3>
      <div className="questions-list">
        {questions.map((item, i) => {
          if (item.questions || item.steps) {
            const steps = item.questions || item.steps;
            return (
              <div key={i} className="question-group">
                <div className="question-group-title">
                  <span className="material-symbols">{item.icon || 'format_list_numbered'}</span>
                  {item.title}
                </div>
                {steps.map((step, j) => (
                  <QuestionCard key={j} item={step} onClick={handleClick} />
                ))}
              </div>
            );
          }
          return <QuestionCard key={i} item={item} onClick={handleClick} />;
        })}
      </div>
    </aside>
  );
}

function QuestionCard({ item, onClick }) {
  return (
    <button className="question-card" title={item.text} onClick={() => onClick(item)}>
      <span className="material-symbols">{item.icon || 'chat_bubble'}</span>
      <span className="question-card-text">{item.title}</span>
    </button>
  );
}
